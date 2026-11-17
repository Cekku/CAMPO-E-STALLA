// Conti: regime IVA ordinario o speciale agricolo? Confronto sulle fatture dell'azienda (dalla 1.44.0)
import { UI } from '../state.js';
import { esc, nf, N, $, uid, yearOf, today } from '../util.js';
import { ic } from '../icons.js';
import { empty, toast } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { GRUPPI, anno, anni, perc, conf, salvaConf, scenari, rettifica } from '../conti/regime.js';

// numero scritto all'italiana: 150.000 / 150.000,50 / 1234,5 / 1234.56
const numIt = v => { const t = String(v ?? '').trim().replace(/\s|€/g, ''); if (!t) return 0; if (t.includes(',')) return N(t.replace(/\./g, '').replace(',', '.')); if (/^\d{1,3}(\.\d{3})+$/.test(t)) return N(t.replace(/\./g, '')); return N(t); };
const eu = v => (Math.abs(v || 0) < 0.5 ? '0 €' : fmtVal(v, 'eur'));
const kpi = (l, v, s, cls = '', icn = '') => `<div class="kpi static"><span class="k-l">${icn ? ic(icn) : ''}${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const inp = (act, attrs, v, ph = '', w = 90) => `<input class="cell-in" inputmode="decimal" data-act="${act}" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(ph)}" style="max-width:${w}px">`;

export function vRegime() {
  const as = anni();
  if (!as.length) return `<section class="card">${empty('percent', 'Nessuna fattura caricata', 'Per confrontare i due regimi IVA servono le fatture di acquisto e di vendita (meglio di almeno un anno intero). Se ce l\'hai, carica anche la dichiarazione IVA.', `<button class="btn primary" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica documenti</button>`)}</section>`;
  const c = conf();
  const y = as.includes(UI.anno) ? UI.anno : as[as.length - 1];
  const A = anno(y);
  const { B, S: SC } = scenari(8);
  const primo = SC[0];
  const possibili = SC.filter(s => !s.vincolo);
  const conv = possibili.find(s => s.netto > 0);
  const top = possibili.reduce((m, s) => (!m || s.netto > m.netto ? s : m), null);

  // ---- risposta in breve
  const meglio = A.vantaggioSpec > 0;
  const verdetto = `<section class="card"><div class="card-h"><h2>${ic('scale')}In breve</h2></div><div class="pad-x">
    <p>Nel <b>${y}</b>, in regime <b>ordinario</b> l'IVA da versare è <b>${eu(A.ord)}</b>${A.ord < 0 ? ' (cioè un credito)' : ''}; in regime <b>speciale agricolo</b> sarebbe stata <b>${eu(A.spec)}</b>.
    ${Math.abs(A.vantaggioSpec) < 1 ? 'I due regimi si equivalgono.' : meglio ? `Il regime speciale avrebbe fatto risparmiare <b class="t-ok">${eu(A.vantaggioSpec)}</b>.` : `Il regime ordinario ha fatto risparmiare <b class="t-ok">${eu(-A.vantaggioSpec)}</b>: restare conviene.`}</p>
    <p>La regola è semplice: <b>il regime speciale conviene quando l'IVA pagata sugli acquisti è più bassa della compensazione</b> (${nf(perc('latte'), 1)}% del latte venduto, ${nf(perc('bovini'), 1)}% dei bovini venduti…). Nel ${y}: IVA sugli acquisti <b>${eu(A.ivaAcq)}</b>, compensazione <b>${eu(A.comp)}</b>.</p>
    ${A.venAgr ? `<p>Il punto di pareggio: finché l'IVA sugli acquisti resta sotto il <b>${nf(A.comp / A.venAgr * 100, 1)}%</b> delle vendite agricole (${eu(A.comp)} all'anno con le vendite del ${y}) conviene lo speciale; sopra, l'ordinario.</p>` : ''}
    ${conv ? `<p>${ic('circle-check')} Con i conti di oggi${(c.inv || []).length ? ' e gli investimenti che hai previsto' : ''}, il primo anno in cui passare allo speciale conviene davvero (contando la rettifica e i 3 anni di vincolo) è il <b>${conv.Y}</b>: guadagno netto circa <b class="t-ok">${eu(conv.netto)}</b>.${top && top.Y !== conv.Y && top.netto > conv.netto ? ` Il più conveniente è il <b>${top.Y}</b> (circa ${eu(top.netto)}), perché la rettifica scende ogni anno.` : ''}</p>
    ${conv.controllo ? `<p class="muted small">${ic('triangle-alert')} Nel ${conv.Y} hai ancora beni nel periodo di controllo dell'IVA (fino al ${conv.libero - 1}): la rettifica è già nel conto, ma secondo alcuni commentatori finché il periodo non finisce l'uscita dall'ordinario non è ammessa. Chiedi al commercialista.</p>` : ''}` : B ? `<p>${ic('shield-check')} Con i conti di oggi${(c.inv || []).length ? ' e gli investimenti previsti' : ''}, nei prossimi 8 anni <b>passare allo speciale non conviene</b>: restare in ordinario.</p>` : ''}
    ${primo && primo.vincolo ? `<p class="muted small">${ic('calendar-range')} Avete scelto l'ordinario dal ${N(c.inizio)}: il vincolo dei 3 anni dura fino al ${primo.vincolo}.</p>` : ''}
  </div></section>`;

  // ---- anni a confronto
  const rows = as.map(a => { const X = anno(a); return { anno: String(a), venAgr: X.venAgr, comp: X.comp, ivaVen: X.ivaVen, ivaAcq: X.ivaAcq, ivaInv: X.ivaInv, fonte: X.dich ? 'dichiarazione IVA' : 'fatture', ord: X.ord, spec: X.spec, vant: X.vantaggioSpec, _cls: a === y ? 'on' : '' }; });
  const tAnni = tabella('rganni', {
    title: 'Regime IVA: anni a confronto', sheet: 'Anni', sort: false, rows,
    cols: [{ k: 'anno', h: 'Anno' }, { k: 'venAgr', h: 'Vendite agricole', fmt: 'eur' }, { k: 'comp', h: 'Compensazione', fmt: 'eur' }, { k: 'ivaVen', h: 'IVA sulle vendite', fmt: 'eur' }, { k: 'ivaAcq', h: 'IVA sugli acquisti', fmt: 'eur' }, { k: 'ivaInv', h: '… di cui investimenti', fmt: 'eur' }, { k: 'fonte', h: 'IVA presa da' },
      { k: 'ord', h: 'Da versare: ordinario', fmt: 'eur' }, { k: 'spec', h: 'Da versare: speciale', fmt: 'eur' }, { k: 'vant', h: 'Risparmio con lo speciale', fmt: 'eur', html: r => `<span class="${r.vant > 0 ? 't-ok' : r.vant < 0 ? 't-bad' : ''}">${esc(fmtVal(r.vant, 'eur') || '0 €')}</span>` }],
  });
  const cardAnni = `<section class="card"><div class="card-h"><h2>${ic('list')}Anno per anno</h2>${bottoniExport(['rganni', 'rgvend', 'rgscen', 'rgrett'], 'Regime IVA')}</div>${tAnni}
    <p class="muted small pad-x">Risparmio negativo (in rosso) = in quell'anno l'ordinario è stato meglio. Un'IVA da versare negativa nell'ordinario è un credito. Quando c'è la dichiarazione IVA dell'anno, l'IVA viene da lì (comprende anche schede carburante e scontrini); altrimenti dalle fatture caricate.</p></section>`;

  // ---- vendite del gruppo e percentuali
  const vend = GRUPPI.map(g => ({ k: g.k, gruppo: g.nome, imp: A.gr[g.k].imp, iva: A.gr[g.k].iva, perc: perc(g.k), comp: A.gr[g.k].imp * perc(g.k) / 100 }));
  const tVend = tabella('rgvend', {
    title: 'Vendite e compensazione ' + y, sheet: 'Vendite', sort: false, rows: vend,
    tot: { gruppo: 'Totale', imp: vend.reduce((t, r) => t + r.imp, 0), iva: vend.reduce((t, r) => t + r.iva, 0), comp: A.comp },
    cols: [{ k: 'gruppo', h: 'Prodotto venduto', cls: 'w' }, { k: 'imp', h: 'Imponibile', fmt: 'eur' }, { k: 'iva', h: 'IVA sulle fatture', fmt: 'eur' },
      { k: 'perc', h: 'Compensazione %', fmt: 'num1', html: r => inp('c-rgPerc', `data-k="${r.k}" aria-label="Percentuale di compensazione"`, nf(r.perc, 2)) + ' %' }, { k: 'comp', h: 'Compensazione', fmt: 'eur' }],
  });
  const cardVend = `<section class="card"><div class="card-h"><h2>${ic('milk')}Cosa hai venduto nel ${y}</h2></div>${tVend}
    <p class="muted small pad-x">Percentuali in vigore secondo i decreti: latte fresco 10%, bovini vivi 7% (dal 2023, prima 9,5%), cereali 4%. Se un decreto nuovo le cambia, scrivile qui. Le "altre vendite" (servizi, energia, macchine usate) nel regime speciale pagano l'IVA normale: qui le conto a compensazione 0%. I gruppi vengono dalla categoria delle righe delle fatture.</p></section>`;

  // ---- scenari di cambio
  const tScen = B ? tabella('rgscen', {
    title: 'Se passi al regime speciale', sheet: 'Cambio', sort: false,
    rows: SC.map(s => ({ dal: String(s.Y), vant: s.vantaggio3, rett: s.rettifica, netto: s.netto, ok: s.vincolo ? `vincolo dei 3 anni fino al ${s.vincolo}` : s.netto > 0 ? (s.controllo ? `conviene, ma beni in controllo fino al ${s.libero - 1}` : 'conviene') : 'non conviene' })),
    cols: [{ k: 'dal', h: 'Dal 1° gennaio' }, { k: 'vant', h: 'Risparmio nei 3 anni di vincolo', fmt: 'eur' }, { k: 'rett', h: 'IVA da restituire (rettifica)', fmt: 'eur' }, { k: 'netto', h: 'Guadagno netto', fmt: 'eur', html: r => `<span class="${r.netto > 0 ? 't-ok' : 't-bad'}">${esc(fmtVal(r.netto, 'eur') || '0 €')}</span>` }, { k: 'ok', h: 'Esito' }],
  }) : '';
  const cardScen = B ? `<section class="card"><div class="card-h"><h2>${ic('calendar-range')}Quando conviene cambiare</h2></div>
    ${B.parziale ? `<div class="note-box warn">${ic('triangle-alert')}<span>Ci sono solo le fatture del ${B.anni[0]}, anno non ancora finito: la previsione è più bassa del vero. Carica le fatture di un anno intero.</span></div>` : ''}<p class="muted small pad-x">Previsione sull'anno tipo (media del ${B.anni.join(' e del ')}, senza gli investimenti di quegli anni), più gli investimenti previsti qui sotto. Il regime scelto vale almeno 3 anni. La rettifica (l'IVA da restituire sui beni comprati da poco) scende ogni anno che passa dall'acquisto: per questo il cambio può convenire più avanti. I tre anni del vincolo partono dall'anno del cambio.</p>${tScen}</section>` : '';

  // ---- investimenti previsti
  const inv = (c.inv || []).slice().sort((a, b) => N(a.anno) - N(b.anno));
  const prossimo = yearOf(today()) + 1;
  const cardInv = `<section class="card"><div class="card-h"><h2>${ic('tractor')}Investimenti previsti</h2></div>
    <p class="muted small pad-x">Stalla nuova, trattori, impianti: nell'ordinario l'IVA di questi acquisti si recupera, nello speciale no. Per un lavoro grosso l'ordinario di solito vince.</p>
    <div class="tablewrap etab"><table><thead><tr><th class="t">Anno</th><th class="t w">Cosa</th><th class="n">Imponibile</th><th class="n">IVA %</th><th class="t">Tipo</th><th class="n">IVA</th><th></th></tr></thead><tbody>
    ${inv.map(i => `<tr><td class="t">${esc(i.anno)}</td><td class="t w">${esc(i.nome)}</td><td class="n">${eu(N(i.imp))}</td><td class="n">${nf(N(i.aliq), 0)}%</td><td class="t">${i.cat === 'fabbricati' ? 'fabbricato' : 'macchine, impianti'}</td><td class="n">${eu(N(i.imp) * N(i.aliq) / 100)}</td><td><button class="btn sm ghost" data-act="c-rgInvDel" data-id="${esc(i.id)}" aria-label="Togli">${ic('trash-2')}</button></td></tr>`).join('')}
    <tr><td class="t"><input class="cell-in" id="rgInvAnno" inputmode="numeric" value="${prossimo}" style="max-width:70px" aria-label="Anno"></td><td class="t w"><input class="cell-in" id="rgInvNome" placeholder="es. stalla nuova" aria-label="Cosa"></td><td class="n"><input class="cell-in" id="rgInvImp" inputmode="decimal" placeholder="€" style="max-width:110px" aria-label="Imponibile"></td><td class="n"><select class="cell-in" id="rgInvAliq" aria-label="Aliquota IVA"><option value="22">22%</option><option value="10">10%</option><option value="4">4%</option></select></td><td class="t"><select class="cell-in" id="rgInvCat" aria-label="Tipo"><option value="fabbricati">Fabbricato (10 anni)</option><option value="macchine">Macchine, impianti (5 anni)</option></select></td><td></td><td><button class="btn sm" data-act="c-rgInvAdd">${ic('plus')}Aggiungi</button></td></tr>
    </tbody></table></div></section>`;

  // ---- rettifica
  const R = primo ? primo.R : rettifica(prossimo);
  const tRett = tabella('rgrett', {
    title: 'Rettifica dal ' + R.Y, sheet: 'Rettifica', rows: R.righe.map(r => Object.assign({}, r, { annoT: String(r.anno), resT: `${r.residui} su ${r.per}`, ivaT: r.iva, nota: r.stimata ? 'IVA stimata (bene senza fattura collegata)' : '' })),
    tot: R.righe.length ? { nome: 'Totale' + (R.scorte ? ' con le scorte' : ''), quota: R.tot } : null,
    cols: [{ k: 'nome', h: 'Bene', cls: 'w' }, { k: 'cat', h: 'Tipo' }, { k: 'annoT', h: 'Comprato' }, { k: 'ivaT', h: 'IVA detratta', fmt: 'eur' }, { k: 'resT', h: 'Anni che restano' }, { k: 'quota', h: 'Da restituire', fmt: 'eur' }, { k: 'nota', h: 'Nota' }],
  });
  const cardRett = `<section class="card"><div class="card-h"><h2>${ic('rotate-ccw')}Cosa restituisci passando allo speciale dal ${R.Y}</h2></div>
    <p class="muted small pad-x">Per i beni oltre ${nf(516.46, 2)} € (dal registro "Beni e ammortamenti") si restituisce l'IVA detratta per gli anni che restano: 5 anni dall'acquisto, 10 per i fabbricati. Lo stesso per le scorte in magazzino.</p>${tRett}
    <div class="tablewrap etab"><table><tbody>
    <tr><td class="t">IVA detratta sulle scorte in magazzino a fine anno (mangimi, concimi, gasolio…)</td><td class="n">${inp('c-rgSet', 'data-k="scorte" aria-label="IVA sulle scorte"', c.scorte ? nf(N(c.scorte), 2) : '', '0', 110)} €</td></tr>
    <tr><td class="t">Anno da cui siete in regime ordinario (i beni comprati prima non hanno IVA detratta)</td><td class="n">${inp('c-rgSet', 'data-k="inizio" aria-label="Anno di inizio"', c.inizio || '', 'non so', 90)}</td></tr>
    </tbody></table></div></section>`;

  // ---- imposte sul reddito e forfettario
  const cardRed = `<section class="card"><div class="card-h"><h2>${ic('info')}E il "forfettario" delle imposte?</h2></div><div class="pad-x small">
    <p><b>Il regime forfettario delle partite IVA</b> (quello del 15% o 5%) <b>non si può usare</b>: è solo per le persone fisiche, non per le società come la vostra società semplice.</p>
    <p><b>Le imposte sul reddito sono già "forfettarie"</b>: la società semplice agricola paga sul reddito dei terreni (reddito agrario e dominicale del catasto), non sull'utile vero. È il modo più leggero che esiste e non dipende dal regime IVA. Per i soci coltivatori diretti o IAP la legge di bilancio 2026 ha confermato che questi redditi non pagano IRPEF.</p>
    <p><b>Allevamento</b>: resta nel reddito agrario se almeno un quarto dei mangimi può venire dai vostri terreni; per i capi oltre quel limite si paga un reddito calcolato a forfait. <b>Fotovoltaico</b> e servizi con le macchine: oltre i limiti si paga il 25% dei ricavi.</p>
    <p>L'unica scelta "ordinario o forfait" che avete davvero è quella dell'<b>IVA</b>: è quella confrontata in questa pagina. Il conto è una stima: prima di cambiare regime, verificatelo con il commercialista (il cambio si fa dal 1° gennaio, si comunica nella dichiarazione IVA e vale almeno 3 anni).</p>
  </div></section>`;

  const kp = `<div class="kpis">${kpi('Ordinario ' + y, eu(A.ord), A.ord < 0 ? 'credito IVA' : 'IVA da versare', '', 'receipt')}${kpi('Speciale ' + y, eu(A.spec), 'IVA da versare', '', 'percent')}${kpi('Differenza', eu(Math.abs(A.vantaggioSpec)), A.vantaggioSpec > 0 ? 'a favore dello speciale' : 'a favore dell\'ordinario', '', 'scale')}${kpi('IVA sugli acquisti', eu(A.ivaAcq), `compensazione ${eu(A.comp)}`, '', 'receipt')}</div>`;
  return kp + verdetto + cardAnni + cardVend + cardScen + cardInv + cardRett + cardRed;
}

export async function regimeAct(a, b, d, rerender) {
  if (a === 'c-rgInvAdd') {
    const anno = Math.round(N($('#rgInvAnno')?.value)), nome = ($('#rgInvNome')?.value || '').trim(), imp = numIt($('#rgInvImp')?.value), aliq = N($('#rgInvAliq')?.value), cat = $('#rgInvCat')?.value || 'macchine';
    if (!anno || anno < 2000 || !imp) return toast('Scrivi anno e imponibile', 'err');
    await salvaConf({ inv: [...(conf().inv || []), { id: uid(), anno, nome: nome || 'Investimento', imp, aliq, cat }] });
    toast('Investimento aggiunto'); return rerender();
  }
  if (a === 'c-rgInvDel') { await salvaConf({ inv: (conf().inv || []).filter(i => i.id !== d.id) }); toast('Investimento tolto'); return rerender(); }
}

export async function regimeChange(t, rerender) {
  const a = t.dataset.act; const v = String(t.value || '').trim();
  if (a === 'c-rgPerc') { const p = Object.assign({}, conf().perc || {}); if (v === '') delete p[t.dataset.k]; else p[t.dataset.k] = N(v); await salvaConf({ perc: p }); toast('Percentuale salvata'); return rerender(); }
  if (a === 'c-rgSet') { const k = t.dataset.k; const val = v === '' ? null : k === 'inizio' ? Math.round(N(v)) : numIt(v); await salvaConf({ [k]: val }); toast('Salvato'); return rerender(); }
}
